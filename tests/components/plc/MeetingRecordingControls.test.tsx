import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PlcMember, PlcRecording } from '@/types';
import type { UseMeetingRecorderResult } from '@/hooks/useMeetingRecorder';
import { NoteRecordControl } from '@/components/plc/recording/NoteRecordControl';
import { NoteRecordings } from '@/components/plc/recording/NoteRecordings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, string>) =>
      (o?.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
        String(o?.[k] ?? '')
      ),
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(() => Promise.resolve(true)) }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/config/firebase', () => ({ storage: {} }));

const members = [
  { uid: 'me', displayName: 'Paul Ivers' },
  { uid: 'bailey', displayName: 'Bailey Smith' },
] as PlcMember[];

const recorder = (
  over: Partial<UseMeetingRecorderResult> = {}
): UseMeetingRecorderResult => ({
  isSupported: true,
  phase: 'idle',
  recordingId: null,
  elapsedMs: 0,
  lengthWarning: false,
  micFallback: false,
  pendingUploads: 0,
  error: null,
  mics: [],
  selectedMicId: null,
  start: vi.fn(() => Promise.resolve()),
  pause: vi.fn(() => Promise.resolve()),
  resume: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
  retryFinalize: vi.fn(() => Promise.resolve()),
  selectMic: vi.fn(() => Promise.resolve()),
  refreshMics: vi.fn(() => Promise.resolve()),
  dismissMicFallback: vi.fn(),
  ...over,
});

const recording = (over: Partial<PlcRecording> = {}): PlcRecording => ({
  id: 'r1',
  noteId: 'n1',
  recorderUid: 'bailey',
  status: 'recording',
  parts: [{ segmentCount: 2, durationMs: 60_000 }],
  durationMs: 60_000,
  lastHeartbeatAt: 0,
  createdAt: Date.UTC(2026, 9, 2),
  ...over,
});

describe('NoteRecordControl', () => {
  it("shows a teammate's recording by name and blocks a second one", () => {
    render(
      <NoteRecordControl
        recorder={recorder()}
        recorderNoteId={null}
        noteId="n1"
        live={recording({ status: 'paused' })}
        members={members}
        canRecord
        onStart={vi.fn()}
      />
    );
    expect(screen.getByRole('status').textContent).toContain('Paused');
    expect(screen.getByRole('status').textContent).toContain('Bailey Smith');
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
  });

  it('gives viewers the badge without a Record button', () => {
    render(
      <NoteRecordControl
        recorder={recorder()}
        recorderNoteId={null}
        noteId="n1"
        live={recording()}
        members={members}
        canRecord={false}
        onStart={vi.fn()}
      />
    );
    expect(screen.getByRole('status').textContent).toContain('Recording');
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
  });

  it('gives the recorder Pause and Stop, and the time left near the limit', () => {
    const rec = recorder({
      phase: 'recording',
      recordingId: 'r1',
      elapsedMs: 56 * 60_000,
    });
    render(
      <NoteRecordControl
        recorder={rec}
        recorderNoteId="n1"
        noteId="n1"
        live={recording({ recorderUid: 'me' })}
        members={members}
        canRecord
        onStart={vi.fn()}
      />
    );
    const badge = screen.getByRole('status').textContent ?? '';
    expect(badge).toContain('56:00');
    expect(badge).toContain('4:00 left');
    expect(badge).not.toContain('Paul Ivers');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(rec.stop).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
  });

  it('offers a microphone menu only when there is more than one mic', () => {
    const rec = recorder({
      mics: [
        { deviceId: 'a', label: 'Built-in microphone' },
        { deviceId: 'b', label: 'Jabra Speak 410' },
      ],
      selectedMicId: 'a',
    });
    render(
      <NoteRecordControl
        recorder={rec}
        recorderNoteId={null}
        noteId="n1"
        live={null}
        members={members}
        canRecord
        onStart={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Microphone' }));
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: 'Jabra Speak 410' })
    );
    expect(rec.selectMic).toHaveBeenCalledWith('b');
  });

  it('disables Record outside Chrome', () => {
    render(
      <NoteRecordControl
        recorder={recorder({ isSupported: false })}
        recorderNoteId={null}
        noteId="n1"
        live={null}
        members={members}
        canRecord
        onStart={vi.fn()}
      />
    );
    const button = screen.getByRole('button', { name: 'Record' });
    expect(button).toBeDisabled();
    expect(button.getAttribute('title')).toBe('Recording works in Chrome');
  });
});

describe('NoteRecordings', () => {
  const ready = recording({ status: 'ready' });

  it('lets editors delete audio after confirming', async () => {
    const onDeleteAudio = vi.fn(() => Promise.resolve());
    render(
      <NoteRecordings
        plcId="p1"
        noteTitle="Grade 7"
        recordings={[ready]}
        members={members}
        canEdit
        onDeleteAudio={onDeleteAudio}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete recording' }));
    await vi.waitFor(() => expect(onDeleteAudio).toHaveBeenCalledWith('r1'));
  });

  it('gives viewers play and download but no delete', () => {
    render(
      <NoteRecordings
        plcId="p1"
        noteTitle="Grade 7"
        recordings={[ready]}
        members={members}
        canEdit={false}
        onDeleteAudio={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Delete recording' })
    ).toBeNull();
  });

  it('skips live recordings and ones whose audio is gone', () => {
    const { container } = render(
      <NoteRecordings
        plcId="p1"
        noteTitle="Grade 7"
        recordings={[
          recording(),
          recording({ id: 'r2', status: 'ready', audioDeletedAt: 5 }),
        ]}
        members={members}
        canEdit
        onDeleteAudio={vi.fn()}
      />
    );
    expect(container.textContent).toBe('');
  });

  it('marks an interrupted recording', () => {
    render(
      <NoteRecordings
        plcId="p1"
        noteTitle="Grade 7"
        recordings={[recording({ status: 'ready', interruptedAtMs: 60_000 })]}
        members={members}
        canEdit
        onDeleteAudio={vi.fn()}
      />
    );
    expect(screen.getByText(/Bailey Smith · .* · Interrupted/)).toBeTruthy();
  });
});
