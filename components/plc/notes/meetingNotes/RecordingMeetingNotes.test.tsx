// Render tests for the meeting notes row: which control shows per state, and the claim-then-insert order.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlcMember, PlcRecording } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => {
      let s = (o?.defaultValue as string) ?? k;
      for (const [key, v] of Object.entries(o ?? {})) {
        if (key !== 'defaultValue') s = s.replace(`{{${key}}}`, String(v));
      }
      return s;
    },
  }),
}));

const requestNotes = vi.fn(() => Promise.resolve());
const resolveDraft = vi.fn(() => Promise.resolve());
const loadTranscript = vi.fn(() =>
  Promise.resolve({ segments: [{ speaker: 2, startMs: 4000, text: 'Hello' }] })
);
vi.mock('@/hooks/usePlcMeetingNotes', () => ({
  usePlcMeetingNotes: () => ({ requestNotes, resolveDraft, loadTranscript }),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('@/components/common/Modal', () => ({
  Modal: ({
    children,
    footer,
    title,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
    title: string;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
      {footer}
    </div>
  ),
}));

import { RecordingMeetingNotes } from './RecordingMeetingNotes';

const members: PlcMember[] = [
  {
    uid: 'u-sarah',
    email: 's@x.org',
    displayName: 'Sarah Lund',
    role: 'member',
    joinedAt: 0,
    status: 'active',
  },
];

const base: PlcRecording = {
  id: 'r1',
  noteId: 'n1',
  recorderUid: 'u1',
  status: 'ready',
  parts: [],
  durationMs: 0,
  lastHeartbeatAt: 0,
  createdAt: 0,
};

const draftRec: PlcRecording = {
  ...base,
  status: 'transcribed',
  hasTranscript: true,
  audioDeletedAt: 5,
  draft: {
    markdown: '## Decisions\n- Reteach',
    actionItems: [
      { id: 'a', text: 'Build warm-up', suggestedOwnerUid: 'u-sarah' },
    ],
    generatedAt: 77,
    generatedBy: 'u1',
  },
};

function renderRow(
  recording: PlcRecording,
  opts: { canEdit?: boolean; aiEnabled?: boolean } = {}
) {
  const onApply = vi.fn(() => Promise.resolve());
  render(
    <RecordingMeetingNotes
      plcId="p1"
      recording={recording}
      label="Recording 1"
      members={members}
      canEdit={opts.canEdit ?? true}
      aiEnabled={opts.aiEnabled ?? true}
      onApply={onApply}
    />
  );
  return { onApply };
}

describe('RecordingMeetingNotes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers Generate notes only to editors with access', () => {
    renderRow(base);
    fireEvent.click(screen.getByRole('button', { name: 'Generate notes' }));
    expect(requestNotes).toHaveBeenCalledWith('r1', 'transcribe');
  });

  it('hides Generate notes without the AI flag', () => {
    renderRow(base, { aiEnabled: false });
    expect(screen.queryByRole('button', { name: 'Generate notes' })).toBeNull();
  });

  it('retries from the transcript after a failed summary', () => {
    renderRow({ ...base, status: 'failed', hasTranscript: true });
    expect(screen.getByText("Couldn't make notes")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(requestNotes).toHaveBeenCalledWith('r1', 'regenerate');
  });

  it('claims the draft, then inserts with the confirmed owner', async () => {
    const { onApply } = renderRow(draftRec);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByRole('dialog', { name: 'Recording 1' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Assignee' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(resolveDraft).toHaveBeenCalledWith('r1', 77, 'inserted');
    expect(onApply).toHaveBeenCalledWith(draftRec, 'insert', { a: null });
  });

  it('gives the draft back when the note write fails', async () => {
    const { onApply } = renderRow(draftRec);
    onApply.mockImplementationOnce(() => Promise.reject(new Error('conflict')));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() =>
      expect(resolveDraft).toHaveBeenCalledWith('r1', 77, 'reopen')
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('shows viewers the transcript but not the review', async () => {
    renderRow(draftRec, { canEdit: false });
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    expect(await screen.findByText('Speaker 2')).toBeTruthy();
    expect(screen.getByText('0:04')).toBeTruthy();
  });
});
