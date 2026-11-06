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
  copyFile: vi.fn(),
  deleteFile: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    driveService: {
      uploadFile: mocks.uploadFile,
      makePublic: mocks.makePublic,
      copyFile: mocks.copyFile,
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

const Harness: React.FC<{ perQuestion?: boolean; calculator?: boolean }> = ({
  perQuestion,
  calculator,
}) => {
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
    <QuestionStimulusSection
      state={state}
      questionId="q1"
      calculatorAvailable={calculator}
    />
  ) : (
    <StimulusManagerPanel state={state} calculatorAvailable={calculator} />
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
  mocks.makePublic.mockResolvedValue(undefined);
  mocks.copyFile.mockResolvedValue({ id: 'copy1' });
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

  it('adds a shared copy of a Drive-picked image without asking', async () => {
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
    expect(mocks.showConfirm).not.toHaveBeenCalled();
    expect(mocks.copyFile).toHaveBeenCalledWith(
      'drv1',
      expect.stringContaining('Map.png'),
      'Assets/QuizStimuli'
    );
    expect(mocks.makePublic).toHaveBeenCalledWith('copy1', undefined);
    expect(mocks.makePublic).not.toHaveBeenCalledWith('drv1', undefined);
    expect(latest[0]).toMatchObject({
      type: 'image',
      driveFileId: 'copy1',
      label: 'Map.png',
      url: 'https://drive.google.com/file/d/copy1/view',
    });
  });

  it('keeps the original and warns when the picked file cannot be copied', async () => {
    mocks.openPicker.mockResolvedValue({
      id: 'drv1',
      name: 'Map.png',
      mimeType: 'image/png',
    });
    mocks.copyFile.mockRejectedValue(new Error('403'));
    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose from Drive' })
    );
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(mocks.showAlert).toHaveBeenCalled();
    expect(mocks.makePublic).not.toHaveBeenCalled();
    expect(latest[0]).toMatchObject({ driveFileId: 'drv1' });
  });

  it('deletes the copy when sharing it fails', async () => {
    mocks.openPicker.mockResolvedValue({
      id: 'drv1',
      name: 'Map.png',
      mimeType: 'image/png',
    });
    mocks.makePublic.mockRejectedValue(new Error('403'));
    mocks.deleteFile.mockResolvedValue(undefined);
    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose from Drive' })
    );
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(mocks.deleteFile).toHaveBeenCalledWith('copy1');
    expect(latest[0]).toMatchObject({ driveFileId: 'drv1' });
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

  it('adds a graphing calculator from the Stimuli tab only when allowed', async () => {
    const { unmount } = render(<Harness />);
    expect(
      screen.queryByRole('button', { name: 'Add a calculator' })
    ).toBeNull();
    unmount();
    render(<Harness calculator />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add a calculator' })
    );
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(latest[0]).toMatchObject({
      type: 'calculator',
      calculator: 'graphing',
      url: '',
    });
  });

  it('adds and attaches a calculator from the per-question section', async () => {
    render(<Harness perQuestion calculator />);
    await userEvent.click(screen.getByRole('button', { name: /Stimuli/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Calculator' }));
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(latest[0].type).toBe('calculator');
    expect(toggle).toHaveBeenCalledWith(latest[0].id, 'q1');
  });
});
