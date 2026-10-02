import { describe, it, expect } from 'vitest';
import type { PlcRecording, PlcRecordingDraft } from '@/types';
import {
  applyDraftToActionItems,
  applyDraftToBody,
  formatTranscriptTime,
  meetingNotesRequestMode,
  meetingNotesState,
} from './plcMeetingNotes';
import { STALE_NOTES_JOB_MS } from './plcRecording';

const NOW = 1_800_000_000_000;

const rec = (patch: Partial<PlcRecording> = {}): PlcRecording => ({
  id: 'r1',
  noteId: 'n1',
  recorderUid: 'u1',
  status: 'ready',
  parts: [],
  durationMs: 0,
  lastHeartbeatAt: 0,
  createdAt: 0,
  ...patch,
});

const draft: PlcRecordingDraft = {
  markdown: '## Decisions\n- Reteach',
  actionItems: [
    { id: 'a', text: 'Build warm-up', suggestedOwnerUid: 'u-sarah' },
    { id: 'b', text: 'Email families', suggestedOwnerUid: null },
  ],
  generatedAt: 1,
  generatedBy: 'u1',
};

describe('applyDraftToBody', () => {
  it('appends under the existing body or replaces it', () => {
    expect(applyDraftToBody('## Agenda\n- x\n\n', '## D\n- y', 'insert')).toBe(
      '## Agenda\n- x\n\n## D\n- y'
    );
    expect(applyDraftToBody('', '## D', 'insert')).toBe('## D');
    expect(applyDraftToBody('old', '## D', 'replace')).toBe('## D');
  });
});

describe('applyDraftToActionItems', () => {
  it('keeps existing items and uses the confirmed owners', () => {
    const existing = [
      {
        id: 'e',
        text: 'Old',
        done: true,
        createdBy: 'u1',
        createdAt: 0,
      },
    ];
    const out = applyDraftToActionItems(
      existing,
      draft,
      { a: null },
      'u2',
      NOW
    );
    expect(out[0]).toBe(existing[0]);
    expect(
      out.slice(1).map((i) => [i.text, i.assigneeUid, i.createdBy])
    ).toEqual([
      ['Build warm-up', null, 'u2'],
      ['Email families', null, 'u2'],
    ]);
    expect(
      applyDraftToActionItems([], draft, {}, 'u2', NOW)[0].assigneeUid
    ).toBe('u-sarah');
  });
});

describe('meetingNotesState', () => {
  it('maps each recording state to what the row shows', () => {
    expect(meetingNotesState(rec(), NOW)).toBe('generate');
    expect(meetingNotesState(rec({ audioDeletedAt: 1 }), NOW)).toBe('none');
    expect(
      meetingNotesState(rec({ status: 'queued', jobUpdatedAt: NOW }), NOW)
    ).toBe('working');
    expect(
      meetingNotesState(
        rec({
          status: 'transcribing',
          jobUpdatedAt: NOW - STALE_NOTES_JOB_MS - 1,
        }),
        NOW
      )
    ).toBe('failed');
    expect(meetingNotesState(rec({ status: 'failed' }), NOW)).toBe('failed');
    expect(
      meetingNotesState(rec({ status: 'failed', audioDeletedAt: 1 }), NOW)
    ).toBe('none');
    expect(meetingNotesState(rec({ status: 'transcribed', draft }), NOW)).toBe(
      'ready'
    );
    expect(
      meetingNotesState(
        rec({ status: 'transcribed', draft, draftResolvedAt: 2 }),
        NOW
      )
    ).toBe('resolved');
    expect(meetingNotesState(rec({ status: 'recording' }), NOW)).toBe('none');
  });

  it('retries from the transcript when one exists', () => {
    expect(meetingNotesRequestMode({ hasTranscript: true })).toBe('regenerate');
    expect(meetingNotesRequestMode({})).toBe('transcribe');
  });

  it('formats transcript times', () => {
    expect(formatTranscriptTime(4_000)).toBe('0:04');
    expect(formatTranscriptTime(3_725_000)).toBe('1:02:05');
  });
});
