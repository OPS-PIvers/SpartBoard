import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PaperCropPanel } from '@/components/quiz/paper/PaperCropPanel';
import type { PaperPrivateAnswer, QuizResponseAnswer } from '@/types';
import type { PaperWrittenActions } from '@/utils/paperCropFetch';
import { PaperCropUnavailableError } from '@/utils/paperCropFetch';

const answer = (
  over: Partial<QuizResponseAnswer> = {}
): QuizResponseAnswer => ({
  questionId: 'q1',
  answer: '<p>My ansr is here.</p>',
  answeredAt: 0,
  paperScanId: 'scan1',
  paperTranscript: 'done',
  artifacts: [
    {
      id: 'hw_scan1_q1',
      slot: 'primary',
      kind: 'handwriting',
      storagePath: 'paper_written_crops/t1/scan1/3/q1.webp',
      uploadState: 'uploaded',
    },
  ],
  ...over,
});

const priv = (over: Partial<PaperPrivateAnswer> = {}): PaperPrivateAnswer => ({
  scanId: 'scan1',
  status: 'done',
  rawTranscript: 'My ansr is here.',
  attempts: 1,
  charged: true,
  updatedAt: 0,
  ...over,
});

const actions = (): PaperWrittenActions => ({
  updateTranscript: vi
    .fn()
    .mockResolvedValue({ answer: '<p>x</p>', snapshotRewritten: false }),
  applyNewerScan: vi
    .fn()
    .mockResolvedValue({ scanId: 'scan2', paperTranscript: 'pending' }),
  transcribeBlank: vi.fn().mockResolvedValue({ jobId: 'j' }),
  retry: vi.fn().mockResolvedValue({}),
});

const setup = (
  props: Partial<React.ComponentProps<typeof PaperCropPanel>> = {}
) => {
  const a = actions();
  const resolveCrop = vi.fn().mockResolvedValue('data:image/webp;base64,AA');
  render(
    <PaperCropPanel
      questionNumber={7}
      sessionId="s1"
      responseKey="r1"
      questionId="q1"
      answer={answer()}
      privateDoc={priv()}
      hasSnapshot={false}
      resolveCrop={resolveCrop}
      actions={a}
      {...props}
    />
  );
  return { actions: a, resolveCrop };
};

afterEach(() => vi.restoreAllMocks());

describe('PaperCropPanel', () => {
  it('shows the crop with its question alt text', async () => {
    const { resolveCrop } = setup();
    expect(
      await screen.findByAltText('Handwritten answer, question 7')
    ).toBeInTheDocument();
    expect(resolveCrop).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', responseKey: 'r1' })
    );
  });

  it('offers a reload when the crop fails, but not when it is gone', async () => {
    setup({
      resolveCrop: vi.fn().mockRejectedValue(new Error('network')),
    });
    expect(await screen.findByText('Handwriting unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('shows no reload for a deleted crop', async () => {
    setup({
      resolveCrop: vi
        .fn()
        .mockRejectedValue(new PaperCropUnavailableError('deleted')),
    });
    expect(await screen.findByText('Handwriting unavailable')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('names each transcription state', () => {
    setup({
      answer: answer({ answer: '', paperTranscript: 'pending' }),
      privateDoc: priv({ status: 'pending' }),
    });
    expect(screen.getByText('Transcribing')).toBeVisible();
  });

  it('retries a failed or over-limit transcript', async () => {
    const { actions: a } = setup({
      answer: answer({ answer: '', paperTranscript: 'pending' }),
      privateDoc: priv({ status: 'over-quota' }),
    });
    expect(screen.getByText('Daily limit')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(a.retry).toHaveBeenCalledWith({
        sessionId: 's1',
        responseKey: 'r1',
        questionId: 'q1',
      })
    );
  });

  it('transcribes a box the ink check called blank', async () => {
    const { actions: a } = setup({
      answer: answer({ answer: '', paperTranscript: 'blank' }),
      privateDoc: priv({ status: 'blank' }),
    });
    expect(screen.getByText('Blank')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit transcript' })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Not blank? Transcribe' })
    );
    await waitFor(() => expect(a.transcribeBlank).toHaveBeenCalled());
  });

  it('lists uncertain words until the transcript is edited', () => {
    const spans = [{ start: 3, end: 7 }];
    setup({ privateDoc: priv({ uncertainSpans: spans }) });
    expect(
      screen.getByText('Check transcript', { selector: 'span' })
    ).toBeVisible();
    expect(screen.getByText('ansr').tagName).toBe('MARK');
  });

  it('hides uncertain marks after an edit but keeps the badge', () => {
    setup({
      privateDoc: priv({
        uncertainSpans: [{ start: 3, end: 7 }],
        editedAt: 1,
        editedBy: 't1',
      }),
    });
    expect(screen.getByText('Check transcript')).toBeVisible();
    expect(screen.queryByText('ansr')).toBeNull();
    expect(screen.getByText('Edited')).toBeVisible();
  });

  it('saves an edit without a warning when no snapshot exists', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { actions: a } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
    const box = screen.getByRole('textbox', { name: 'Transcript' });
    expect(box).toHaveValue('My ansr is here.');
    fireEvent.change(box, { target: { value: 'My answer is here.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save transcript' }));
    await waitFor(() =>
      expect(a.updateTranscript).toHaveBeenCalledWith({
        sessionId: 's1',
        responseKey: 'r1',
        questionId: 'q1',
        text: 'My answer is here.',
        expectedScanId: 'scan1',
      })
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it('warns before an edit that clears highlights', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { actions: a } = setup({ hasSnapshot: true });
    fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save transcript' }));
    await waitFor(() =>
      expect(a.updateTranscript).toHaveBeenCalledWith(
        expect.objectContaining({ confirmSnapshotRewrite: true })
      )
    );
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('does not save when the teacher cancels the warning', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { actions: a } = setup({ hasSnapshot: true });
    fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save transcript' }));
    expect(a.updateTranscript).not.toHaveBeenCalled();
  });

  it('asks again when the server finds a snapshot the grader had not seen', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const a = actions();
    (a.updateTranscript as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce({
        code: 'functions/failed-precondition',
        details: { reason: 'confirm-snapshot-rewrite' },
      })
      .mockResolvedValueOnce({ answer: '<p>x</p>', snapshotRewritten: true });
    setup({ actions: a });
    fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save transcript' }));
    await waitFor(() => expect(a.updateTranscript).toHaveBeenCalledTimes(2));
    expect(confirm).toHaveBeenCalledOnce();
    expect(a.updateTranscript).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmSnapshotRewrite: true })
    );
  });

  it('says so when a rescan replaced the answer mid-edit', async () => {
    const a = actions();
    (a.updateTranscript as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: 'functions/aborted',
    });
    setup({ actions: a });
    fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save transcript' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A newer scan replaced this answer.'
    );
  });

  it('applies a kept rescan', async () => {
    const onAnswerChanged = vi.fn();
    const { actions: a } = setup({
      privateDoc: priv({
        newerScan: { scanId: 'scan2', page: 1, state: 'ink' },
      }),
      onAnswerChanged,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use new scan' }));
    await waitFor(() => expect(onAnswerChanged).toHaveBeenCalled());
    expect(a.applyNewerScan).toHaveBeenCalled();
  });

  it('asks to try again while a transcription holds the page', async () => {
    const a = actions();
    (a.transcribeBlank as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: 'functions/aborted',
    });
    setup({
      actions: a,
      answer: answer({ answer: '', paperTranscript: 'blank' }),
      privateDoc: priv({ status: 'blank' }),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Not blank? Transcribe' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Transcription is running. Try again shortly.'
    );
  });

  it('offers Connect Drive while the crop waits for Drive', () => {
    const onConnectDrive = vi.fn();
    setup({ archive: { archiveStatus: 'awaiting-drive' }, onConnectDrive });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Drive' }));
    expect(onConnectDrive).toHaveBeenCalled();
  });

  it('is read-only without actions', () => {
    setup({ actions: undefined });
    expect(
      screen.queryByRole('button', { name: 'Edit transcript' })
    ).toBeNull();
  });
});
