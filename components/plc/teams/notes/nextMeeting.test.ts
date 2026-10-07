import { describe, expect, it } from 'vitest';
import type { PlcMeetingCadence, PlcNote } from '@/types';
import { zonedTimeToEpoch } from '@/utils/plcHomeTime';
import { plannedMeetingNoteId, selectNextMeeting } from './nextMeeting';

const weeklyTue: PlcMeetingCadence = {
  frequency: 'weekly',
  weekday: 2,
  time: '15:15',
  anchorDate: '2026-09-01',
};
const NOW = zonedTimeToEpoch(2026, 10, 7, 9, 0);

const meetingNote = (id: string, meetingAt: number | null): PlcNote =>
  ({
    id,
    title: id,
    body: '',
    kind: 'meeting',
    meetingAt,
    createdBy: 'u1',
    createdAt: 1,
    lastEditedBy: 'u1',
    lastEditedAt: 1,
  }) as PlcNote;

describe('selectNextMeeting', () => {
  it('plans the next cadence date with a deterministic note id', () => {
    const next = selectNextMeeting({ meetingCadence: weeklyTue }, [], NOW);
    expect(next).toMatchObject({
      kind: 'planned',
      noteId: plannedMeetingNoteId('2026-10-13'),
    });
  });

  it('returns the planned note once a teammate has created it', () => {
    const created = meetingNote(
      'meeting-2026-10-13',
      zonedTimeToEpoch(2026, 10, 13, 15, 15)
    );
    const next = selectNextMeeting(
      { meetingCadence: weeklyTue },
      [created],
      NOW
    );
    expect(next).toMatchObject({ kind: 'note', note: { id: created.id } });
  });

  it('prefers an earlier meeting note created by hand', () => {
    const early = meetingNote('n1', zonedTimeToEpoch(2026, 10, 9, 15, 0));
    const next = selectNextMeeting({ meetingCadence: weeklyTue }, [early], NOW);
    expect(next).toMatchObject({ kind: 'note', note: { id: 'n1' } });
  });

  it('ignores past and deleted notes and needs a cadence otherwise', () => {
    const past = meetingNote('old', zonedTimeToEpoch(2026, 9, 30, 15, 0));
    const deleted = { ...meetingNote('del', NOW + 86_400_000), deletedAt: 1 };
    expect(selectNextMeeting({}, [past, deleted], NOW)).toBeNull();
  });
});
