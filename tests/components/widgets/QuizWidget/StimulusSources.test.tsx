/**
 * Stimuli tab add sources: Drive picker, drag and drop, and clipboard paste.
 */
import React, { useEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { QuizQuestion, QuizStimulus } from '@/types';
import type { QuizEditorController } from '@/components/widgets/QuizWidget/components/useQuizEditorState';

const mocks = vi.hoisted(() => ({
  openPicker: vi.fn(),
  ensureGoogleScope: vi.fn(),
  uploadFile: vi.fn(),
  makePublic: vi.fn(),
  deleteFile: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    driveService: {
      uploadFile: mocks.uploadFile,
      makePublic: mocks.makePublic,
      deleteFile: mocks.deleteFile,
    },
    userDomain: null,
  }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: mocks.openPicker }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: mocks.ensureGoogleScope }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: mocks.showConfirm,
    showAlert: mocks.showAlert,
  }),
}));

import {
  StimulusManagerPanel,
  QuestionStimulusSection,
} from '@/components/widgets/QuizWidget/components/StimulusManagerPanel';

const question: QuizQuestion = {
  id: 'q1',
  timeLimit: 0,
  text: 'Q',
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
};

let latest: QuizStimulus[] = [];
const toggle = vi.fn();

const Harness: React.FC<{ perQuestion?: boolean }> = ({ perQuestion }) => {
  const [stimuli, setStimuli] = useState<QuizStimulus[]>([]);
  useEffect(() => {
    latest = stimuli;
  }, [stimuli]);
  const state = {
    questions: [question],
    bankSlots: [],
    toggleStimulusOnSlot: vi.fn(),
    stimuli,
    addStimulus: (s: QuizStimulus) => setStimuli((p) => [...p, s]),
    updateStimulus: vi.fn(),
    deleteStimulus: vi.fn(),
    toggleStimulusOnQuestion: toggle,
    setStimulusOnAllQuestions: vi.fn(),
  } as unknown as QuizEditorController;
  return perQuestion ? (
    <QuestionStimulusSection state={state} questionId="q1" />
  ) : (
    <StimulusManagerPanel state={state} />
  );
};

const png = () => new File(['x'], 'shot.png', { type: 'image/png' });

function pasteEvent(files: File[], types: string[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files, types },
  });
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  latest = [];
  mocks.ensureGoogleScope.mockResolvedValue('token');
  mocks.showConfirm.mockResolvedValue(true);
  mocks.makePublic.mockResolvedValue(undefined);
  mocks.uploadFile.mockResolvedValue({ id: 'up1' });
});

describe('Stimuli tab sources', () => {
  it('shows file, Drive, passage and link controls', () => {
    render(<Harness />);
    expect(screen.getByText('Drop or paste a file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Choose from Drive' })
    ).toBeVisible();
    expect(screen.getByPlaceholderText('Paste a link')).toBeInTheDocument();
  });

  it('adds a Drive-picked image after sharing it', async () => {
    mocks.openPicker.mockResolvedValue({
      id: 'drv1',
      name: 'Map.png',
      mimeType: 'image/png',
    });
    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose from Drive' })
    );
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(mocks.openPicker).toHaveBeenCalledWith({
      mode: 'stimuli',
      token: 'token',
    });
    expect(mocks.makePublic).toHaveBeenCalledWith('drv1', undefined);
    expect(latest[0]).toMatchObject({
      type: 'image',
      driveFileId: 'drv1',
      label: 'Map.png',
      url: 'https://drive.google.com/file/d/drv1/view',
    });
  });

  it('adds nothing when the share prompt is declined', async () => {
    mocks.openPicker.mockResolvedValue({
      id: 'drv1',
      name: 'Map.png',
      mimeType: 'image/png',
    });
    mocks.showConfirm.mockResolvedValue(false);
    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose from Drive' })
    );
    await waitFor(() => expect(mocks.showConfirm).toHaveBeenCalled());
    expect(mocks.makePublic).not.toHaveBeenCalled();
    expect(latest).toHaveLength(0);
  });

  it('adds a Drive-picked Google Doc as an embed', async () => {
    mocks.openPicker.mockResolvedValue({
      id: 'doc1',
      name: 'Reading',
      mimeType: 'application/vnd.google-apps.document',
    });
    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose from Drive' })
    );
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(latest[0]).toMatchObject({
      type: 'gdoc-embed',
      label: 'Reading',
      url: 'https://docs.google.com/document/d/doc1/edit',
    });
  });

  it('uploads a pasted image', async () => {
    render(<Harness />);
    document.body.dispatchEvent(pasteEvent([png()], ['Files']));
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(latest[0]).toMatchObject({ type: 'image', driveFileId: 'up1' });
  });

  it('leaves a text paste into the link field alone', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Paste a link');
    const event = pasteEvent([png()], ['Files', 'text/plain']);
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads a dropped file', async () => {
    render(<Harness />);
    const zone = screen.getByTestId('stimulus-drop-zone');
    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [png()] },
    });
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('attaches a Drive pick to the question from the per-question section', async () => {
    mocks.openPicker.mockResolvedValue({
      id: 'drv2',
      name: 'Clip.mp3',
      mimeType: 'audio/mpeg',
    });
    render(<Harness perQuestion />);
    await userEvent.click(screen.getByRole('button', { name: /Stimuli/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Drive' }));
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(latest[0].type).toBe('audio');
    expect(toggle).toHaveBeenCalledWith(latest[0].id, 'q1');
  });
});
